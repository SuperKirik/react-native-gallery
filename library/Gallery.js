import React, { Component, PropTypes } from 'react';
import {
  View,
  Dimensions,
  ActivityIndicator,
  TouchableOpacity,
} from 'react-native';

import Image from 'react-native-transformable-image';
import ViewPager from '@ldn0x7dc/react-native-view-pager';
import {createResponder} from 'react-native-gesture-responder';


export default class Gallery extends Component {

  static propTypes = {
    ...View.propTypes,
    images: PropTypes.array,

    initialPage: PropTypes.number,
    pageMargin: PropTypes.number,
    onPageSelected: PropTypes.func,
    onPageScrollStateChanged: PropTypes.func,
    onPageScroll: PropTypes.func,

    onSingleTapConfirmed: PropTypes.func,
    onGalleryStateChanged: PropTypes.func
  };

  imageRefs = new Map();
  activeResponder = undefined;
  firstMove = true;
  currentPage = 0;
  pageCount = 0;
  gestureResponder = undefined;

  constructor(props) {
    super(props);
    const { height, width } = Dimensions.get('window');
    this.dimensions = {
      height,
      width,
    };
    this.state = {
      loading: false,
    };
  }

  componentWillMount() {
    function onResponderReleaseOrTerminate(evt, gestureState) {
      if (this.activeResponder) {
        if (this.activeResponder === this.viewPagerResponder
          && !this.shouldScrollViewPager(evt, gestureState)
          && Math.abs(gestureState.vx) > 0.5) {
          this.activeResponder.onEnd(evt, gestureState, true);
          this.getViewPagerInstance().flingToPage(this.currentPage, gestureState.vx);
        } else {
          this.activeResponder.onEnd(evt, gestureState);
        }
        this.activeResponder = null;
      }
      this.firstMove = true;
      this.props.onGalleryStateChanged && this.props.onGalleryStateChanged(true);
    }

    this.gestureResponder = createResponder({
      onStartShouldSetResponderCapture: (evt, gestureState) => true,
      onStartShouldSetResponder: (evt, gestureState) => {
        return true;
      },
      onResponderGrant: (evt, gestureState) => {
        this.activeImageResponder(evt, gestureState);
      },
      onResponderMove: (evt, gestureState) => {
        if (this.firstMove) {
          this.firstMove = false;
          if (this.shouldScrollViewPager(evt, gestureState)) {
            this.activeViewPagerResponder(evt, gestureState);
          }
          this.props.onGalleryStateChanged && this.props.onGalleryStateChanged(false);
        }
        if (this.activeResponder === this.viewPagerResponder) {
          const dx = gestureState.moveX - gestureState.previousMoveX;
          const offset = this.getViewPagerInstance().getScrollOffsetFromCurrentPage();
          if (dx > 0 && offset > 0 && !this.shouldScrollViewPager(evt, gestureState)) {
            if (dx > offset) { // active image responder
              this.getViewPagerInstance().scrollByOffset(offset);
              gestureState.moveX -= offset;
              this.activeImageResponder(evt, gestureState);
            }
          } else if (dx < 0 && offset < 0 && !this.shouldScrollViewPager(evt, gestureState)) {
            if (dx < offset) { // active image responder
              this.getViewPagerInstance().scrollByOffset(offset);
              gestureState.moveX -= offset;
              this.activeImageResponder(evt, gestureState);
            }
          }
        }
        const offset = Math.abs((this.dimensions.height / 2) - gestureState.moveY);
        this.props.onMove && this.props.onMove(offset);
        this.activeResponder.onMove(evt, gestureState);
      },
      onResponderRelease: onResponderReleaseOrTerminate.bind(this),
      onResponderTerminate: onResponderReleaseOrTerminate.bind(this),
      onResponderTerminationRequest: (evt, gestureState) => false, //Do not allow parent view to intercept gesture
      onResponderSingleTapConfirmed: (evt, gestureState) => {
        this.props.onSingleTapConfirmed && this.props.onSingleTapConfirmed(this.currentPage);
      }
    });

    this.viewPagerResponder = {
      onStart: (evt, gestureState) => {
        this.getViewPagerInstance().onResponderGrant(evt, gestureState);
      },
      onMove: (evt, gestureState) => {
        this.getViewPagerInstance().onResponderMove(evt, gestureState);
      },
      onEnd: (evt, gestureState, disableSettle) => {
        this.getViewPagerInstance().onResponderRelease(evt, gestureState, disableSettle);
      }
    }

    this.imageResponder = {
      onStart: ((evt, gestureState) => {
        this.getCurrentImageTransformer().onResponderGrant(evt, gestureState);
      }),
      onMove: (evt, gestureState) => {
        this.props.onStartMove();
        this.getCurrentImageTransformer().onResponderMove(evt, gestureState);
      },
      onEnd: (evt, gestureState) => {
        if (gestureState.moveY === 0) {
          this.getCurrentImageTransformer().onResponderRelease(evt, gestureState);
          return;
        }
        if (gestureState.moveY < (this.dimensions.height * this.props.threshold / 100)) {
          this.props.onVerticalToTopScroll(gestureState.moveY)
            .then(() => {
              this.getCurrentImageTransformer().onResponderRelease(evt, gestureState);
            });
          return;
        }
        if (gestureState.moveY > this.dimensions.height - (this.dimensions.height * this.props.threshold / 100)) {
          this.props.onVerticalToBottomScroll(gestureState.moveY)
            .then(() => {
              this.getCurrentImageTransformer().onResponderRelease(evt, gestureState);
            });
          return;
        }
        this.props.onPressEnd();
        this.getCurrentImageTransformer().onResponderRelease(evt, gestureState);
      }
    }
  }

  shouldScrollViewPager(evt, gestureState) {
    if (gestureState.numberActiveTouches > 1) {
      return false;
    }
    const viewTransformer = this.getCurrentImageTransformer();
    const space = viewTransformer.getAvailableTranslateSpace();
    const dx = gestureState.moveX - gestureState.previousMoveX;

    if (dx > 0 && space.left <= 0 && this.currentPage > 0) {
      return true;
    }
    if (dx < 0 && space.right <= 0 && this.currentPage < this.pageCount - 1) {
      return true;
    }
    return false;
  }

  activeImageResponder(evt, gestureState) {
    if (this.activeResponder !== this.imageResponder) {
      if (this.activeResponder === this.viewPagerResponder) {
        this.viewPagerResponder.onEnd(evt, gestureState, true); //pass true to disable ViewPager settle
      }
      this.activeResponder = this.imageResponder;
      this.imageResponder.onStart(evt, gestureState);
    }
  }

  activeViewPagerResponder(evt, gestureState) {
    if (this.activeResponder !== this.viewPagerResponder) {
      if (this.activeResponder === this.imageResponder) {
        this.imageResponder.onEnd(evt, gestureState);
      }
      this.activeResponder = this.viewPagerResponder;
      this.viewPagerResponder.onStart(evt, gestureState)
    }
  }

  getImageTransformer(page) {
    if (page >= 0 && page < this.pageCount) {
      let ref = this.imageRefs.get(page + '');
      if (ref) {
        return ref.getViewTransformerInstance();
      }
    }
  }

  getCurrentImageTransformer() {
    return this.getImageTransformer(this.currentPage);
  }

  getViewPagerInstance() {
    return this.refs['galleryViewPager'];
  }

  render() {
    let gestureResponder = this.gestureResponder;

    let images = this.props.images;
    if (!images) {
      images = [];
    }
    this.pageCount = images.length;

    if (this.pageCount <= 0) {
      gestureResponder = {};
    }

    return (
      <ViewPager
        {...this.props}
        ref='galleryViewPager'
        scrollEnabled={false}
        renderPage={this.renderPage.bind(this)}
        pageDataArray={images}
        {...gestureResponder}
        onPageSelected={this.onPageSelected.bind(this)}
        onPageScrollStateChanged={this.onPageScrollStateChanged.bind(this)}
        onPageScroll={this.onPageScroll.bind(this)}
      />
    );
  }

  setPage(page) {
    this.refs['galleryViewPager'].setPage(page);
  }

  onPageSelected(page) {
    this.currentPage = page;
    this.props.onPageSelected && this.props.onPageSelected(page);
  }

  onPageScrollStateChanged(state) {
    if (state === 'idle') {
      this.resetHistoryImageTransform();
    }
    this.props.onPageScrollStateChanged && this.props.onPageScrollStateChanged(state);
  }

  onPageScroll(e) {
    this.props.onPageScroll && this.props.onPageScroll(e);
  }

  onLoadStart = (e) => {
    if (this.props.onLoadStart) {
      this.props.onLoadStart(e);
    }

    this.setState({ loading: true });
  }

  onLoadEnd = (e) => {
    if (this.props.onLoadEnd) {
      this.props.onLoadEnd(e);
    }

    this.setState({ loading: false });
  }

  renderPage(pageData, pageId, layout) {
    const { onViewTransformed, onTransformGestureReleased, ...other } = this.props;
    const loader = this.state.loading
      ? (
        <View
          style={{
            justifyContent: 'center',
            alignItems: 'center',
            flex: 1,
          }}
        >
          {this.props.renderLoader
            ? this.props.renderLoader()
            : <ActivityIndicator />
          }
        </View>
      )
      : null;
    return typeof pageData === 'string' ? (
      <Image
        {...other}
        onViewTransformed={((transform) => {
           onViewTransformed && onViewTransformed(transform, pageId);
        }).bind(this)}
        onTransformGestureReleased={((transform) => {
           onTransformGestureReleased && onTransformGestureReleased(transform, pageId);
        }).bind(this)}
        ref={((ref) => {
           this.imageRefs.set(pageId, ref);
        }).bind(this)}
        key={'innerImage#' + pageId}
        style={[{ width: layout.width, height: layout.height },
          typeof pageData === 'string' ? {} : { tintColor: 'white' }]}
        onLoadStart={this.onLoadStart}
        onLoadEnd={this.onLoadEnd}
        source={typeof pageData === 'string' ? { uri: pageData } : pageData}
      >
        {loader}
      </Image>
    ) : (
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Image
          {...other}
          onViewTransformed={((transform) => {
             onViewTransformed && onViewTransformed(transform, pageId);
          }).bind(this)}
          onTransformGestureReleased={((transform) => {
             onTransformGestureReleased && onTransformGestureReleased(transform, pageId);
          }).bind(this)}
          ref={((ref) => {
             this.imageRefs.set(pageId, ref);
          }).bind(this)}
          key={'innerImage#' + pageId}
          style={{
            height: 100,
            width: 100,
            tintColor: 'white',
          }}
          onLoadStart={this.onLoadStart}
          onLoadEnd={this.onLoadEnd}
          source={pageData}
        />
      </View>
    );
  }

  resetHistoryImageTransform() {
    let transformer = this.getImageTransformer(this.currentPage + 1);
    if (transformer) {
      transformer.forceUpdateTransform({scale: 1, translateX: 0, translateY: 0});
    }

    transformer = this.getImageTransformer(this.currentPage - 1);
    if (transformer) {
      transformer.forceUpdateTransform({scale: 1, translateX: 0, translateY: 0});
    }
  }
}
